const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
function selectTab(tab) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(item.getAttribute("aria-controls"));
    panel.hidden = !selected;
    panel.classList.toggle("is-entering", selected);
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

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));
const desk = document.querySelector(".hero-desk");
const progress = document.querySelector(".reading-progress span");
let revealObserver;
let progressFrame = 0;
let pointerFrame = 0;
let tiltX = 0;
let tiltY = 0;

function resetTilt() {
  cancelAnimationFrame(pointerFrame);
  pointerFrame = 0;
  desk.style.setProperty("--tilt-x", "0deg");
  desk.style.setProperty("--tilt-y", "0deg");
}
function configureMotion() {
  revealObserver?.disconnect();
  resetTilt();
  const enabled = !motionPreference.matches && "IntersectionObserver" in window;
  document.documentElement.classList.toggle("motion-ready", enabled);
  if (!enabled) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }
  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    },
    { threshold: 0.06 },
  );
  for (const item of revealItems) revealObserver.observe(item);
}
configureMotion();
motionPreference.addEventListener("change", configureMotion);
finePointer.addEventListener("change", resetTilt);

desk.addEventListener("pointermove", (event) => {
  if (motionPreference.matches || !finePointer.matches || event.pointerType !== "mouse") return;
  const rect = desk.getBoundingClientRect();
  tiltX = (0.5 - (event.clientY - rect.top) / rect.height) * 4;
  tiltY = ((event.clientX - rect.left) / rect.width - 0.5) * 4;
  if (pointerFrame) return;
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = 0;
    desk.style.setProperty("--tilt-x", `${tiltX.toFixed(2)}deg`);
    desk.style.setProperty("--tilt-y", `${tiltY.toFixed(2)}deg`);
  });
});
desk.addEventListener("pointerleave", resetTilt);

function updateProgress() {
  progressFrame = 0;
  const length = document.documentElement.scrollHeight - window.innerHeight;
  const fraction = length > 0 ? Math.min(1, Math.max(0, window.scrollY / length)) : 0;
  progress.style.transform = `scaleX(${fraction})`;
}
function scheduleProgress() {
  if (!progressFrame) progressFrame = requestAnimationFrame(updateProgress);
}
window.addEventListener("scroll", scheduleProgress, { passive: true });
window.addEventListener("resize", scheduleProgress, { passive: true });
window.addEventListener("pageshow", scheduleProgress);
updateProgress();
