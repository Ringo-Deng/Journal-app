const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
function selectTab(tab) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
  }
}
for (const tab of tabs) {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(tab);
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[next]);
    tabs[next].focus();
  });
}

const viewer = document.querySelector(".screenshot-viewer");
const viewerImage = document.getElementById("viewer-image");
let screenshotOpener;
for (const link of document.querySelectorAll("[data-screenshot]")) {
  link.addEventListener("click", (event) => {
    if (
      typeof viewer.showModal !== "function" ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    screenshotOpener = link;
    document.getElementById("viewer-title").textContent = link.dataset.title;
    document.getElementById("viewer-original").href = link.href;
    viewerImage.src = link.href;
    viewerImage.alt = link.querySelector("img").alt;
    viewer.querySelector(".viewer-image").scrollLeft = 0;
    viewer.showModal();
    document.getElementById("viewer-close").focus();
  });
}
document.getElementById("viewer-close").addEventListener("click", () => viewer.close());
viewer.addEventListener("click", (event) => {
  const bounds = viewer.getBoundingClientRect();
  if (
    event.target === viewer &&
    (event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom)
  )
    viewer.close();
});
viewer.addEventListener("close", () => screenshotOpener?.focus({ preventScroll: true }));

// Check this page's own local service only; do not probe other ports or hosts.
async function showRunningApp() {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(location.hostname)) return;
  try {
    const response = await fetch("/api/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return;
    const health = await response.json();
    if (health.ok !== true || health.runtimeId !== "page-elements-v0.1.20") return;
    document.getElementById("running-app-link").hidden = false;
    document.getElementById("running-app-note").textContent =
      "当前地址的拾光已在运行，可以直接进入。这里的按钮只负责打开页面。";
  } catch {
    // A standalone introduction page still provides the complete installation path.
  }
}
showRunningApp();
