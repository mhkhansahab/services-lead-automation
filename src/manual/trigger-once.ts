import { tasks } from "@trigger.dev/sdk/v3";

const taskId = process.argv[2];

if (!taskId) {
  console.error("Usage: npm run run:task:once -- <task-id>");
  process.exit(1);
}

if (!process.env.TRIGGER_SECRET_KEY) {
  console.error("Missing TRIGGER_SECRET_KEY in environment.");
  process.exit(1);
}

async function main() {
  console.log(`Triggering task: ${taskId}`);

  const result = await tasks.triggerAndWait(taskId as any, {} as any, {
    tags: ["manual-run"]
  });

  if (result.ok) {
    console.log(JSON.stringify({ ok: true, taskId, runId: result.id, output: result.output }, null, 2));
    return;
  }

  console.error(JSON.stringify({ ok: false, taskId, runId: result.id, error: result.error }, null, 2));
  process.exit(1);
}

main().catch((error) => {
  console.error(String((error as Error)?.message ?? error));
  process.exit(1);
});
