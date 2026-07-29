import type {
    GcodePoint,
    GcodeSegment,
} from "../../types/gcode";

export interface ToolpathSimplifyOptions {
    /**
     * Desired maximum number of preview segments.
     */
    targetSegments: number;

    /**
     * Small movements below this length are not useful
     * for the visual preview.
     */
    minimumSegmentLengthMm: number;

    /**
     * Maximum gap between consecutive segments before
     * they are considered separate paths.
     */
    connectionToleranceMm: number;

    /**
     * Initial direction tolerance for merging segments.
     */
    initialAngleToleranceDegrees: number;

    /**
     * Maximum direction tolerance used when the model
     * is still above targetSegments.
     */
    maximumAngleToleranceDegrees: number;

    /**
     * Prevents an entire long straight path from
     * becoming one enormous preview segment.
     */
    initialMaximumMergedLengthMm: number;

    maximumMergedLengthMm: number;
}

const DEFAULT_OPTIONS: ToolpathSimplifyOptions = {
    targetSegments: 150_000,

    minimumSegmentLengthMm: 0.01,
    connectionToleranceMm: 0.002,

    initialAngleToleranceDegrees: 0.5,
    maximumAngleToleranceDegrees: 8,

    initialMaximumMergedLengthMm: 3,
    maximumMergedLengthMm: 40,
};

function distanceSquared(
    first: GcodePoint,
    second: GcodePoint,
): number {
    const x = second.x - first.x;
    const y = second.y - first.y;
    const z = second.z - first.z;

    return (
        x * x +
        y * y +
        z * z
    );
}

function distance(
    first: GcodePoint,
    second: GcodePoint,
): number {
    return Math.sqrt(
        distanceSquared(
            first,
            second,
        ),
    );
}

function angleBetweenSegments(
    firstStart: GcodePoint,
    firstEnd: GcodePoint,
    secondStart: GcodePoint,
    secondEnd: GcodePoint,
): number {
    const firstX =
        firstEnd.x -
        firstStart.x;

    const firstY =
        firstEnd.y -
        firstStart.y;

    const firstZ =
        firstEnd.z -
        firstStart.z;

    const secondX =
        secondEnd.x -
        secondStart.x;

    const secondY =
        secondEnd.y -
        secondStart.y;

    const secondZ =
        secondEnd.z -
        secondStart.z;

    const firstLength =
        Math.sqrt(
            firstX * firstX +
            firstY * firstY +
            firstZ * firstZ,
        );

    const secondLength =
        Math.sqrt(
            secondX * secondX +
            secondY * secondY +
            secondZ * secondZ,
        );

    if (
        firstLength === 0 ||
        secondLength === 0
    ) {
        return 0;
    }

    const dotProduct =
        firstX * secondX +
        firstY * secondY +
        firstZ * secondZ;

    const cosine =
        Math.max(
            -1,
            Math.min(
                1,
                dotProduct /
                (
                    firstLength *
                    secondLength
                ),
            ),
        );

    return (
        Math.acos(cosine) *
        180 /
        Math.PI
    );
}

function segmentsAreConnected(
    first: GcodeSegment,
    second: GcodeSegment,
    connectionToleranceSquared: number,
): boolean {
    return (
        first.layer ===
        second.layer &&
        first.extruding ===
        second.extruding &&
        distanceSquared(
            first.end,
            second.start,
        ) <=
        connectionToleranceSquared
    );
}

interface SimplifyPassOptions {
    minimumSegmentLengthSquared:
    number;

    connectionToleranceSquared:
    number;

    angleToleranceDegrees:
    number;

    maximumMergedLengthMm:
    number;
}

function runSimplifyPass(
    source:
        readonly GcodeSegment[],

    options:
        SimplifyPassOptions,
): GcodeSegment[] {
    const output:
        GcodeSegment[] = [];

    let current:
        GcodeSegment | null = null;

    for (const segment of source) {
        if (
            distanceSquared(
                segment.start,
                segment.end,
            ) <
            options
                .minimumSegmentLengthSquared
        ) {
            continue;
        }

        if (!current) {
            current = {
                ...segment,
            };

            continue;
        }

        const connected =
            segmentsAreConnected(
                current,
                segment,
                options
                    .connectionToleranceSquared,
            );

        const angle =
            connected
                ? angleBetweenSegments(
                    current.start,
                    current.end,
                    segment.start,
                    segment.end,
                )
                : Number.POSITIVE_INFINITY;

        const mergedLength =
            connected
                ? distance(
                    current.start,
                    segment.end,
                )
                : Number.POSITIVE_INFINITY;

        const canMerge =
            connected &&
            angle <=
            options
                .angleToleranceDegrees &&
            mergedLength <=
            options
                .maximumMergedLengthMm;

        if (canMerge) {
            current = {
                start: current.start,
                end: segment.end,

                layer: segment.layer,
                extruding:
                    segment.extruding,

                /*
                 * A merged segment is considered printed
                 * after its final original command.
                 */
                commandIndex:
                    segment.commandIndex,
            };

            continue;
        }

        output.push(current);

        current = {
            ...segment,
        };
    }

    if (current) {
        output.push(current);
    }

    return output;
}

function groupSegments(
    source:
        readonly GcodeSegment[],

    groupSize: number,

    connectionToleranceSquared:
        number,
): GcodeSegment[] {
    const output:
        GcodeSegment[] = [];

    let groupStart:
        GcodeSegment | null = null;

    let groupEnd:
        GcodeSegment | null = null;

    let segmentsInGroup = 0;

    const flushGroup = (): void => {
        if (
            !groupStart ||
            !groupEnd
        ) {
            return;
        }

        output.push({
            start:
                groupStart.start,

            end:
                groupEnd.end,

            layer:
                groupEnd.layer,

            extruding:
                groupEnd.extruding,

            commandIndex:
                groupEnd.commandIndex,
        });

        groupStart = null;
        groupEnd = null;
        segmentsInGroup = 0;
    };

    for (const segment of source) {
        if (!groupStart || !groupEnd) {
            groupStart = segment;
            groupEnd = segment;
            segmentsInGroup = 1;

            continue;
        }

        const connected =
            segmentsAreConnected(
                groupEnd,
                segment,
                connectionToleranceSquared,
            );

        if (
            !connected ||
            segmentsInGroup >=
            groupSize
        ) {
            flushGroup();

            groupStart = segment;
            groupEnd = segment;
            segmentsInGroup = 1;

            continue;
        }

        groupEnd = segment;
        segmentsInGroup++;
    }

    flushGroup();

    return output;
}

function applyTargetLimit(
    source:
        readonly GcodeSegment[],

    targetSegments: number,

    connectionToleranceSquared:
        number,
): GcodeSegment[] {
    if (
        source.length <=
        targetSegments
    ) {
        return [...source];
    }

    let groupSize =
        Math.ceil(
            source.length /
            targetSegments,
        );

    let result =
        groupSegments(
            source,
            groupSize,
            connectionToleranceSquared,
        );

    /*
     * Separate extrusion and travel paths may cause
     * slightly more groups than initially expected.
     */
    while (
        result.length >
        targetSegments &&
        groupSize <
        source.length
    ) {
        groupSize =
            Math.ceil(
                groupSize * 1.35,
            );

        result =
            groupSegments(
                source,
                groupSize,
                connectionToleranceSquared,
            );
    }

    return result;
}

export interface ToolpathSimplifyResult {
    segments: GcodeSegment[];

    originalCount: number;
    simplifiedCount: number;

    reductionPercent: number;

    angleToleranceDegrees: number;
    maximumMergedLengthMm: number;

    targetLimitApplied: boolean;
}

export function simplifyToolpath(
    source:
        readonly GcodeSegment[],

    suppliedOptions:
        Partial<ToolpathSimplifyOptions> = {},
): ToolpathSimplifyResult {
    const options:
        ToolpathSimplifyOptions = {
        ...DEFAULT_OPTIONS,
        ...suppliedOptions,
    };

    const originalCount =
        source.length;

    if (originalCount === 0) {
        return {
            segments: [],

            originalCount: 0,
            simplifiedCount: 0,

            reductionPercent: 0,

            angleToleranceDegrees:
                options
                    .initialAngleToleranceDegrees,

            maximumMergedLengthMm:
                options
                    .initialMaximumMergedLengthMm,

            targetLimitApplied: false,
        };
    }

    const minimumSegmentLengthSquared =
        options.minimumSegmentLengthMm *
        options.minimumSegmentLengthMm;

    const connectionToleranceSquared =
        options
            .connectionToleranceMm *
        options
            .connectionToleranceMm;

    let angleToleranceDegrees =
        options
            .initialAngleToleranceDegrees;

    let maximumMergedLengthMm =
        options
            .initialMaximumMergedLengthMm;

    let simplified =
        runSimplifyPass(
            source,
            {
                minimumSegmentLengthSquared,
                connectionToleranceSquared,
                angleToleranceDegrees,
                maximumMergedLengthMm,
            },
        );

    while (
        simplified.length >
        options.targetSegments &&
        (
            angleToleranceDegrees <
            options
                .maximumAngleToleranceDegrees ||
            maximumMergedLengthMm <
            options
                .maximumMergedLengthMm
        )
    ) {
        angleToleranceDegrees =
            Math.min(
                options
                    .maximumAngleToleranceDegrees,

                angleToleranceDegrees *
                1.6,
            );

        maximumMergedLengthMm =
            Math.min(
                options
                    .maximumMergedLengthMm,

                maximumMergedLengthMm *
                1.6,
            );

        /*
         * Always simplify from the original source.
         * This prevents several passes from progressively
         * introducing more visual distortion.
         */
        simplified =
            runSimplifyPass(
                source,
                {
                    minimumSegmentLengthSquared,
                    connectionToleranceSquared,
                    angleToleranceDegrees,
                    maximumMergedLengthMm,
                },
            );
    }

    let targetLimitApplied = false;

    if (
        simplified.length >
        options.targetSegments
    ) {
        simplified =
            applyTargetLimit(
                simplified,
                options.targetSegments,
                connectionToleranceSquared,
            );

        targetLimitApplied = true;
    }

    const simplifiedCount =
        simplified.length;

    const reductionPercent =
        Math.round(
            (
                1 -
                simplifiedCount /
                originalCount
            ) *
            10_000,
        ) / 100;

    return {
        segments: simplified,

        originalCount,
        simplifiedCount,

        reductionPercent,

        angleToleranceDegrees,
        maximumMergedLengthMm,

        targetLimitApplied,
    };
}