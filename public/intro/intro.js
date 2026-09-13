const descriptions = {
  "tab-collage": "文字、照片、贴纸各自独立。拖动、旋转、叠放，把喜欢的东西摆在喜欢的位置。",
  "tab-materials":
    "花卉、邮票、旧纸片，收好每一次心动。导入自己的图片，裁出喜欢的部分，下次做手帐时继续用。",
  "tab-reading":
    "合上时是一本书，翻开时是自己的日常。封面、书脊、跨页与翻页，让写过的日子值得再读一遍。",
};
const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
function selectTab(tab) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
  }
  document.getElementById("feature-description").textContent = descriptions[tab.id];
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
const swatches = Array.from(document.querySelectorAll("[data-paper].paper-swatch"));
for (const swatch of swatches) {
  swatch.addEventListener("click", () => {
    document.querySelector(".demo-spread").dataset.paper = swatch.dataset.paper;
    for (const item of swatches) item.setAttribute("aria-pressed", String(item === swatch));
  });
}
const bookToggle = document.querySelector(".book-toggle");
bookToggle.addEventListener("click", () => {
  const expanded = bookToggle.getAttribute("aria-expanded") !== "true";
  bookToggle.setAttribute("aria-expanded", String(expanded));
  document.getElementById("mini-book").classList.toggle("is-open", expanded);
  bookToggle.firstChild.textContent = expanded ? "合上手帐 " : "翻开这本手帐 ";
});
