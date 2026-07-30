import {
  Menu,
  Tray,
  app,
} from "electron";

export function createTray(
  iconPath: string,
  showMainWindow: () => void,
): Tray {
  const tray = new Tray(iconPath);

  tray.setToolTip("PrintInterface");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open PrintInterface",
        click: showMainWindow,
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => app.quit(),
      },
    ]),
  );
  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);

  return tray;
}
