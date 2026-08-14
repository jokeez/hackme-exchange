try {
  var KEY = "hackme-exchange-demo-v5-theme";
  var LEGACY = "hackme-exchange-demo-v4-theme";
  var t = localStorage.getItem(KEY) || localStorage.getItem(LEGACY);
  if (t !== "hub" && t !== "wallet") {
    var h = (location.hostname || "").toLowerCase();
    t = h === "127.0.0.1" || h === "localhost" || h === "[::1]" ? "wallet" : "hub";
  }
  document.documentElement.dataset.theme = t;
} catch (e) {}
