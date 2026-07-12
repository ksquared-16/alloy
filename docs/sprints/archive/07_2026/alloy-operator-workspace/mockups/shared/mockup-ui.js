/** Presentation / screenshot mode. ?screenshot=1 or press P */
(function () {
  if (location.search.includes("presentation=1") || location.search.includes("screenshot=1")) {
    document.documentElement.classList.add("presentation-mode");
    if (location.search.includes("screenshot=1")) {
      document.documentElement.classList.add("screenshot-mode");
    }
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "p" && !e.metaKey && !e.ctrlKey && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      document.documentElement.classList.toggle("presentation-mode");
    }
  });
})();
