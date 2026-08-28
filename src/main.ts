import { applyTheme, loadTheme } from "./theme";
import { boot } from "./app";
import { applyHubEmbedChrome } from "./embed";
import { syncMobileLayoutClass } from "./mobile";
import { healStorage } from "./store";

applyHubEmbedChrome();
syncMobileLayoutClass();
applyTheme(loadTheme());
healStorage();
boot();
