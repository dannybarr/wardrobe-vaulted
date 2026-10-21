import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("founder wardrobe is read-only and priced", async ({ page }) => {
  await mkdir("/opt/cursor/artifacts", { recursive: true });
  const writes: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/") || url.includes("supabase.co") || url.includes("supabase.com")) {
      writes.push(url);
    }
  });

  await page.goto("/demo");
  await expect(page.getByTestId("demo-banner")).toContainText("read-only");
  await expect(page.getByText("Black Nike Sneakers")).toBeVisible();
  await expect(page.getByText("Brown & Cream Nike Sneakers")).toBeVisible();

  const total = page.getByTestId("net-worth-total");
  await expect(total).toBeVisible();
  const figure = (await total.textContent()) ?? "";
  expect(figure).toMatch(/£[1-9]/);
  expect(figure).not.toMatch(/Needs details/);
  await expect(page.getByTestId("net-worth-change")).toBeVisible();
  await expect(page.getByTestId("category-breakdown")).toBeVisible();
  await expect(page.getByTestId("brand-breakdown")).toBeVisible();
  await expect(page.getByTestId("top-pieces")).toBeVisible();

  const thumb = page.locator(".worth-thumb").first();
  await expect(thumb).toHaveAttribute("src", /\/demo\/library\/.+\.svg$/);
  const src = await thumb.getAttribute("src");
  expect(src).toBeTruthy();
  const image = await page.request.get(src!);
  expect(image.ok()).toBeTruthy();
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

  await page.getByRole("button", { name: "Looks" }).click();
  await expect(page.getByRole("heading", { name: "Your outfits" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Light Wash Straight Jeans + Black & Pink Technical Top" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Black Shark Graphic Derby Boots/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Wishlist" }).click();
  await expect(page.getByText("Poubel Bangle")).toBeVisible();

  await page.getByRole("button", { name: "Pieces" }).click();
  await page.getByRole("button", { name: "View Grey Ribbed Knit" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/auth\?mode=signup/);
  expect(writes).toEqual([]);
});
