import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const clientPath = new URL("../app/selection-test/SelectionTestClient.tsx", import.meta.url);
const pagePath = new URL("../app/selection-test/page.tsx", import.meta.url);
const cssPath = new URL("../app/selection-test/selection-test.css", import.meta.url);

test("selection demo is isolated from journal state and exposed on its own route", async () => {
  const [client, page] = await Promise.all([
    readFile(clientPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);
  assert.match(page, /SelectionTestClient/);
  assert.match(client, /不读取、不修改正式手帐/);
  assert.doesNotMatch(client, /\/api\/state|changeSpread|journal\.json/);
});

test("selection demo wires marquee preview, click-through selection bounds and lower-layer cycling", async () => {
  const [client, css] = await Promise.all([
    readFile(clientPath, "utf8"),
    readFile(cssPath, "utf8"),
  ]);
  assert.match(client, /setPreview\(idsInSelectionRect/);
  assert.match(client, /切换下层/);
  assert.match(client, /event\.pointerType === ["']touch["']/);
  assert.match(client, /paintMovePreview\(gesture\.movingIds, delta\)/);
  assert.match(client, /data-demo-selection/);
  assert.match(client, /showSelectionActions/);
  assert.match(client, /rotatedSelectionBounds\(selectedItems, PAPER_ASPECT_RATIO\)/);
  assert.match(client, /classList\.add\(["']is-moving["']\)/);
  const moveHandler = client.slice(
    client.indexOf("function itemPointerMove"),
    client.indexOf("function finishMove"),
  );
  assert.doesNotMatch(moveHandler, /setItems\(/);
  assert.match(css, /\.selection-demo__selection \{[\s\S]*?pointer-events: none;/);
  assert.match(css, /\.selection-demo__item\.is-selected::after \{[\s\S]*?opacity: 0;/);
  assert.match(css, /\.selection-demo__edge \{[\s\S]*?pointer-events: auto;/);
  assert.match(css, /\.selection-demo__paper\.is-moving[\s\S]*?cursor: grabbing;/);
});
