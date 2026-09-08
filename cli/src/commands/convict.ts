import { Command } from "commander";
import { priceOf, segMath, projectShares, BASE_PRICE, CURVE_K } from "@oases/options";

export function registerConvictCommand(program: Command): void {
  const convict = program
    .command("convict")
    .description("Conviction engine & bonding board calculations");

  convict
    .command("price")
    .description("Calculate bonding curve price for a given pool size")
    .argument("<pool>", "Pool size in USDC base units (6 decimals)")
    .action((poolStr: string) => {
      const pool = BigInt(poolStr);
      const price = priceOf(pool);
      console.log(`🌊 Pool: ${pool} | Price: ${price} (Base: ${BASE_PRICE}, K: ${CURVE_K})`);
    });

  convict
    .command("project")
    .description("Project conviction shares over a time window")
    .requiredOption("-p, --pool <pool>", "Current side pool in USDC (6 decimals)")
    .requiredOption("-s, --sideRate <rate>", "Total side streaming rate in USDC/sec")
    .requiredOption("-u, --userRate <rate>", "User streaming rate in USDC/sec")
    .requiredOption("-d, --duration <seconds>", "Duration in seconds")
    .action((opts: { pool: string; sideRate: string; userRate: string; duration: string }) => {
      const pool = BigInt(opts.pool);
      const sideRate = BigInt(opts.sideRate);
      const userRate = BigInt(opts.userRate);
      const dt = BigInt(opts.duration);

      const shares = projectShares({ pool, sideRate, userRate, dt });
      const { newPool, dG } = segMath({ pool, sideRate, dt });
      console.log(`\n🌊 Conviction Projection:`);
      console.log(`  Initial Pool:     ${pool}`);
      console.log(`  New Pool:         ${newPool}`);
      console.log(`  Delta G:          ${dG}`);
      console.log(`  Projected Shares: ${shares}`);
    });
}
