import {
  Menu,
  Tray,
  app,
  type NativeImage,
} from "electron";

export function createTray(
  icon: NativeImage,
  showMainWindow: () => void,
): Tray {
  const tray = new Tray(
    icon.resize({
      width: 32,
      height: 32,
      quality: "best",
    }),
  );

  tray.setToolTip("PrintDeck");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open PrintDeck",
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
