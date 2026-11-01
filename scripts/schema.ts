import { z } from "zod";
import { writeFile } from "node:fs/promises";
import { bankSchema } from "../src/core/bank.ts";
await writeFile(
  "docs/question-bank.schema.json",
  JSON.stringify(z.toJSONSchema(bankSchema, { target: "draft-7" }), null, 2) +
    "\n",
);
console.log("Updated docs/question-bank.schema.json");
