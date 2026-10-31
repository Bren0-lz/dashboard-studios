import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Goals } from "@dash/shared";

/** Metas mensais por linha, guardadas no próprio dashboard (arquivo JSON). */
export interface GoalsStore {
  read(): Promise<Goals>;
  write(goals: Goals): Promise<Goals>;
}

const empty: Goals = { studio: 0, aesthetics: 0 };

export function fileGoalsStore(path: string): GoalsStore {
  return {
    async read() {
      try {
        const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<Goals>;
        return { studio: Number(parsed.studio) || 0, aesthetics: Number(parsed.aesthetics) || 0 };
      } catch {
        return { ...empty };
      }
    },
    async write(goals) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(goals, null, 2));
      return goals;
    },
  };
}

export function memoryGoalsStore(initial: Goals = empty): GoalsStore {
  let goals = { ...initial };
  return {
    read: async () => ({ ...goals }),
    write: async (next) => {
      goals = { ...next };
      return goals;
    },
  };
}
