import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("demo signup, net worth, share cards and a listing", async ({ page }) => {
  await mkdir("/opt/cursor/artifacts", { recursive: true });
  await page.goto("/demo");
  await expect(page.getByText("Every piece and figure on this page is fictional.")).toBeVisible();

  await page.getByTestId("demo-email").fill("ada@example.com");
  await page.getByTestId("demo-signup").locator("input[type=password]").fill("demo-pass");
  await page.getByTestId("demo-signup").locator("button[type=submit]").click();

  const total = page.getByTestId("net-worth-total");
  await expect(total).toBeVisible();
  const before = (await total.textContent()) ?? "";
  expect(before).toMatch(/£/);
  expect(before).not.toMatch(/Needs details/);
  await expect(page.getByTestId("net-worth-change")).toBeVisible();
  await expect(page.getByTestId("category-breakdown")).toBeVisible();
  await expect(page.getByTestId("brand-breakdown")).toBeVisible();
  await expect(page.getByTestId("top-pieces")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/net-worth-home.png", fullPage: true });

  await page.getByTestId("open-share").click();
  await expect(page.getByTestId("share-card-story")).toBeVisible();
  await expect(page.getByTestId("share-card-square")).toBeVisible();
  const story = page.getByTestId("share-card-story").locator("img");
  const square = page.getByTestId("share-card-square").locator("img");
  await story.screenshot({ path: "/opt/cursor/artifacts/share-card-9x16.png" });
  await square.screenshot({ path: "/opt/cursor/artifacts/share-card-1x1.png" });
  await page.getByTestId("hide-numbers").check();
  await expect(story).toHaveAttribute("src", /Hidden/);
  await page.getByTestId("share-sheet").getByRole("button", { name: "Close" }).click();

  await page.getByTestId("top-pieces").locator("button").first().click();
  await expect(page.getByTestId("sell-sheet")).toBeVisible();
  await expect(page.getByTestId("sell-price")).toContainText("£");
  await expect(page.getByTestId("sell-description")).not.toBeEmpty();
  await page.getByTestId("sell-sheet").screenshot({ path: "/opt/cursor/artifacts/sell-this.png" });

  await page.getByTestId("sell-sheet").getByRole("button", { name: "Close" }).click();
  await page.getByTestId("demo-add-open").click();
  await page.getByTestId("demo-photo").setInputFiles({
    name: "trainer.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.getByTestId("demo-add-submit").click();
  await expect(total).not.toHaveText(before);
});
