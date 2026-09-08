#!/usr/bin/env node
import { Command } from "commander";
import { WAD, ConvictionSide } from "@oases/options";
import { registerConvictCommand } from "./commands/convict";

const program = new Command();

program
  .name("oases")
  .description("Oases: Living State Engine & Algorithmic Conviction Arena")
  .version("0.1.0");

program
  .command("status")
  .description("Check status of Oases systems")
  .action(() => {
    console.log("🌊 Oases CLI active.");
    console.log(`- Options engine: WAD = ${WAD}, YES = ${ConvictionSide.YES}`);
    console.log("- Lake x402 gateway: Ready");
    console.log("- Harbinger agents: Ready");
  });

registerConvictCommand(program);

program.parse(process.argv);
