export type PhysicalClass = "Actor" | "Place" | "Act" | "Bond";

export const PHYSICAL_CLASSES: readonly PhysicalClass[] = [
  "Actor",
  "Place",
  "Act",
  "Bond",
] as const;

export function isPhysicalClass(value: unknown): value is PhysicalClass {
  return (
    typeof value === "string" &&
    (PHYSICAL_CLASSES as readonly string[]).includes(value)
  );
}

export function assertPhysicalClass(
  value: unknown,
): asserts value is PhysicalClass {
  if (!isPhysicalClass(value)) {
    throw new Error(
      `Invalid PhysicalClass: "${String(value)}". Must strictly be one of: ${PHYSICAL_CLASSES.join(", ")}`,
    );
  }
}
