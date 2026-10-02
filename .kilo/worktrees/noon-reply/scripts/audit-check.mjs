import fs from "node:fs";

const p = JSON.parse(fs.readFileSync("people.json", "utf8"));
console.log("COUNT:", p.length);

const badRegex = p.filter(
  (x) =>
    !/^https:\/\/(www\.)?linkedin\.com\/in\//.test(x.linkedin) ||
    !/^https:\/\/(www\.)?instagram\.com\//.test(x.instagram),
);
console.log("BAD URLS (Regex):", badRegex.map((x) => x.name));

const badTypes = p.filter(
  (x) =>
    typeof x.linkedin !== "string" ||
    typeof x.instagram !== "string" ||
    !x.linkedin.startsWith("https://") ||
    !x.instagram.startsWith("https://") ||
    x.linkedin.includes("[") ||
    x.linkedin.includes("]") ||
    x.instagram.includes("[") ||
    x.instagram.includes("]"),
);
console.log("BAD URLS (Format/Brackets):", badTypes.map((x) => x.name));

// Check demoPeople.ts text
const demoTxt = fs.readFileSync("lib/data/demoPeople.ts", "utf8");
const demoUrls = demoTxt.match(/https:\/\/[^\s"',]+/g) || [];
const badDemoUrls = demoUrls.filter(
  (u) =>
    u.includes("[") ||
    u.includes("]") ||
    u.includes("(") ||
    u.includes(")") ||
    u.includes("`"),
);
console.log("DEMO PEOPLE BAD URLS:", badDemoUrls);

console.table(
  p.map((x, i) => ({
    i: i + 1,
    name: x.name,
    linkedin: x.linkedin,
    instagram: x.instagram,
  })),
);
