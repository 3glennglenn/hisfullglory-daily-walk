import test from "node:test";
import assert from "node:assert/strict";
import { products } from "../src/config.ts";
import { lowestPrice } from "../src/shopPrice.ts";

// The Study Bibles card on Today says "Hand-picked, from $X" (01.2 D-04): X is the lowest price in the product data.

test("the lowest price of the configured products", () => {
  assert.equal(lowestPrice(products), "$49.99");
});

test("mixed price strings give the smaller amount, written with two decimals", () => {
  assert.equal(lowestPrice([{ price: "From $49.99 USD" }, { price: "$69.99 USD" }]), "$49.99");
  assert.equal(lowestPrice([{ price: "$69.99 USD" }, { price: "$ 24.5" }, { price: "From $1,049.00" }]), "$24.50");
  assert.equal(lowestPrice([{ price: "$30" }]), "$30.00");
});

test("no parsable price gives undefined, so the card shows no price line", () => {
  assert.equal(lowestPrice([]), undefined);
  assert.equal(lowestPrice([{ price: "Ask in the shop" }, { price: "" }]), undefined);
});

test("every cover name is part of its product's title, so a link's name holds its visible text", () => {
  for (const p of products) assert.ok(p.title.includes(p.shortName), `${p.shortName} is in ${p.title}`);
});
