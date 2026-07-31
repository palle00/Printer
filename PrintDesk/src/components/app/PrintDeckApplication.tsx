import { usePrintDeckApplication } from "../../hooks/usePrintDeckApplication";
import ApplicationDialogs from "./ApplicationDialogs";
import DashboardLayout from "./DashboardLayout";
import FileDropShell from "./FileDropShell";

export default function PrintDeckApplication() {
  const controller = usePrintDeckApplication();

  return (
    <FileDropShell
      disabled={controller.dashboard.hasActivePrint}
      onDropFile={(file) => void controller.dashboard.loadDroppedFile(file)}
    >
      <DashboardLayout controller={controller} />
      <ApplicationDialogs controller={controller} />
    </FileDropShell>
  );
}
