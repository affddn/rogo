import { Link } from "react-router";

// The bridge refuses other game actions while the progression job runs; point to where to stop it.
export function AutomationRunningNote({ message }: { message: string }) {
  if (!message.includes("progression automation is running")) return null;
  return (
    <p className="text-sm">
      <Link className="font-semibold underline" to="/automation">
        Open Automation
      </Link>{" "}
      to follow or stop the running job.
    </p>
  );
}
