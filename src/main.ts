import { applyTheme, loadTheme } from "./theme";
import { boot } from "./app";
import { applyHubEmbedChrome } from "./embed";
import { healStorage } from "./store";

applyHubEmbedChrome();
applyTheme(loadTheme());
healStorage();
boot();
