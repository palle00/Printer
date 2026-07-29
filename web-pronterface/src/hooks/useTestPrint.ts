import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import type { ParsedGcode } from "../types/gcode";
import {
    initialPrintProgress,
    type PrinterPosition,
    type PrinterStatus,
} from "../types/printer";

const MIN_TEST_DURATION_SECONDS = 20;
const MAX_TEST_DURATION_SECONDS = 120;
const SEGMENTS_PER_SECOND = 250;

const initialPosition: PrinterPosition = {
    x: 0,
    y: 0,
    z: 0,
    e: 0,
};

function calculateDuration(
    gcode: ParsedGcode,
): number {
    const estimatedSeconds =
        gcode.segments.length /
        SEGMENTS_PER_SECOND;

    return Math.max(
        MIN_TEST_DURATION_SECONDS,
        Math.min(
            MAX_TEST_DURATION_SECONDS,
            estimatedSeconds,
        ),
    );
}

export function useTestPrint() {
    const [isTestMode, setIsTestMode] =
        useState(false);

    const [status, setStatus] =
        useState<PrinterStatus>("idle");

    const [progress, setProgress] =
        useState({
            ...initialPrintProgress,
        });

    const [position, setPosition] =
        useState<PrinterPosition>({
            ...initialPosition,
        });

    const frameRef =
        useRef<number | null>(null);

    const gcodeRef =
        useRef<ParsedGcode | null>(null);

    const statusRef =
        useRef<PrinterStatus>("idle");

    const durationMillisecondsRef =
        useRef(0);

    const elapsedBeforeRunRef =
        useRef(0);

    const runStartedAtRef =
        useRef(0);

    const setTestStatus = useCallback(
        (nextStatus: PrinterStatus) => {
            statusRef.current = nextStatus;
            setStatus(nextStatus);
        },
        [],
    );

    const cancelAnimation =
        useCallback(() => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(
                    frameRef.current,
                );

                frameRef.current = null;
            }
        }, []);

    const updateSimulation =
        useCallback(
            (timestamp: number) => {
                const gcode = gcodeRef.current;

                if (
                    !gcode ||
                    statusRef.current !==
                    "printing"
                ) {
                    return;
                }

                const elapsedMilliseconds =
                    elapsedBeforeRunRef.current +
                    (timestamp -
                        runStartedAtRef.current);

                const durationMilliseconds =
                    Math.max(
                        1,
                        durationMillisecondsRef.current,
                    );

                const simulationRatio =
                    Math.min(
                        1,
                        elapsedMilliseconds /
                        durationMilliseconds,
                    );

                const segments =
                    gcode.segments;

                if (segments.length === 0) {
                    setProgress({
                        ...initialPrintProgress,
                        currentLine:
                            gcode.printableLines,
                        totalLines:
                            gcode.printableLines,
                        currentLayer:
                            gcode.totalLayers,
                        totalLayers:
                            gcode.totalLayers,
                        percent: 100,
                        elapsedSeconds:
                            elapsedMilliseconds /
                            1000,
                        etaSeconds: 0,
                    });

                    setTestStatus("idle");
                    return;
                }

                const segmentProgress =
                    simulationRatio *
                    segments.length;

                const segmentIndex =
                    Math.min(
                        segments.length - 1,
                        Math.floor(segmentProgress),
                    );

                const segment =
                    segments[segmentIndex];

                const localProgress =
                    simulationRatio >= 1
                        ? 1
                        : segmentProgress -
                        segmentIndex;

                const x =
                    segment.start.x +
                    (segment.end.x -
                        segment.start.x) *
                    localProgress;

                const y =
                    segment.start.y +
                    (segment.end.y -
                        segment.start.y) *
                    localProgress;

                const z =
                    segment.start.z +
                    (segment.end.z -
                        segment.start.z) *
                    localProgress;

                const e =
                    segment.start.extruding
                        ? localProgress
                        : 0;

                const currentLine =
                    simulationRatio >= 1
                        ? gcode.printableLines
                        : Math.max(
                            0,
                            segment.commandIndex - 1,
                        );

                setPosition({
                    x,
                    y,
                    z,
                    e,
                });

                setProgress({
                    ...initialPrintProgress,

                    currentLine,
                    totalLines:
                        gcode.printableLines,

                    currentLayer:
                        simulationRatio >= 1
                            ? gcode.totalLayers
                            : segment.layer,

                    totalLayers:
                        gcode.totalLayers,

                    percent:
                        simulationRatio * 100,

                    elapsedSeconds:
                        elapsedMilliseconds /
                        1000,

                    etaSeconds: Math.max(
                        0,
                        (durationMilliseconds -
                            elapsedMilliseconds) /
                        1000,
                    ),
                });

                if (simulationRatio >= 1) {
                    frameRef.current = null;
                    setTestStatus("idle");
                    return;
                }

                frameRef.current =
                    requestAnimationFrame(
                        updateSimulation,
                    );
            },
            [setTestStatus],
        );

    const startTestPrint =
        useCallback(
            (gcode: ParsedGcode) => {
                cancelAnimation();

                gcodeRef.current = gcode;

                const durationSeconds =
                    calculateDuration(gcode);

                durationMillisecondsRef.current =
                    durationSeconds * 1000;

                elapsedBeforeRunRef.current = 0;
                runStartedAtRef.current =
                    performance.now();

                setIsTestMode(true);
                setTestStatus("printing");

                setProgress({
                    ...initialPrintProgress,
                    currentLine: 0,
                    totalLines:
                        gcode.printableLines,
                    currentLayer: 1,
                    totalLayers:
                        gcode.totalLayers,
                    percent: 0,
                    elapsedSeconds: 0,
                    etaSeconds:
                        durationSeconds,
                });

                const firstSegment =
                    gcode.segments[0];

                setPosition(
                    firstSegment
                        ? {
                            x:
                                firstSegment.start.x,
                            y:
                                firstSegment.start.y,
                            z:
                                firstSegment.start.z,
                            e: 0,
                        }
                        : {
                            ...initialPosition,
                        },
                );

                frameRef.current =
                    requestAnimationFrame(
                        updateSimulation,
                    );
            },
            [
                cancelAnimation,
                setTestStatus,
                updateSimulation,
            ],
        );

    const pauseTestPrint =
        useCallback(() => {
            if (
                statusRef.current !==
                "printing"
            ) {
                return;
            }

            const now = performance.now();

            elapsedBeforeRunRef.current +=
                now -
                runStartedAtRef.current;

            cancelAnimation();
            setTestStatus("paused");
        }, [
            cancelAnimation,
            setTestStatus,
        ]);

    const resumeTestPrint =
        useCallback(() => {
            if (
                statusRef.current !==
                "paused" ||
                !gcodeRef.current
            ) {
                return;
            }

            runStartedAtRef.current =
                performance.now();

            setTestStatus("printing");

            frameRef.current =
                requestAnimationFrame(
                    updateSimulation,
                );
        }, [
            setTestStatus,
            updateSimulation,
        ]);

    const stopTestPrint =
        useCallback(() => {
            cancelAnimation();
            setTestStatus("stopping");

            window.setTimeout(() => {
                setIsTestMode(false);
                setTestStatus("idle");

                gcodeRef.current = null;
                elapsedBeforeRunRef.current =
                    0;

                setProgress({
                    ...initialPrintProgress,
                });

                setPosition({
                    ...initialPosition,
                });
            }, 300);
        }, [
            cancelAnimation,
            setTestStatus,
        ]);

    const resetTestPrint =
        useCallback(() => {
            cancelAnimation();

            gcodeRef.current = null;
            elapsedBeforeRunRef.current = 0;

            setIsTestMode(false);
            setTestStatus("idle");

            setProgress({
                ...initialPrintProgress,
            });

            setPosition({
                ...initialPosition,
            });
        }, [
            cancelAnimation,
            setTestStatus,
        ]);

    useEffect(() => {
        return () => {
            cancelAnimation();
        };
    }, [cancelAnimation]);

    return {
        isTestMode,
        status,
        progress,
        position,

        startTestPrint,
        pauseTestPrint,
        resumeTestPrint,
        stopTestPrint,
        resetTestPrint,
    };
}