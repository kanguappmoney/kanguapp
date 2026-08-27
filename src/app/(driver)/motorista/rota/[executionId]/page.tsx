import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DriveScreen, type DriveStop } from "@/components/DriveScreen";

export default async function ModoDirecaoPage({
  params,
}: {
  params: Promise<{ executionId: string }>;
}) {
  const { executionId } = await params;
  const supabase = await createClient();

  const { data: execution } = await supabase
    .from("route_executions")
    .select("id, status, route_id, routes(name, direction)")
    .eq("id", executionId)
    .single();

  if (!execution) notFound();
  if (execution.status === "completed") redirect("/motorista/rotas");

  // @ts-expect-error relação aninhada do supabase-js
  const route = execution.routes as { name: string; direction: string };
  const kind: "pickup" | "dropoff" =
    route.direction === "outbound" ? "pickup" : "dropoff";

  const { data: stops } = await supabase
    .from("route_stops")
    .select("student_id, position, students(full_name, pickup_address, dropoff_address)")
    .eq("route_id", execution.route_id)
    .order("position");

  const { data: events } = await supabase
    .from("route_events")
    .select("student_id, type")
    .eq("execution_id", executionId)
    .in("type", ["embarked", "disembarked", "student_absent"]);

  const stateByStudent = new Map<string, "boarded" | "absent">();
  for (const e of events ?? []) {
    if (!e.student_id) continue;
    stateByStudent.set(e.student_id, e.type === "student_absent" ? "absent" : "boarded");
  }

  const driveStops: DriveStop[] = (stops ?? []).map((s) => {
    // @ts-expect-error relação aninhada do supabase-js
    const st = s.students as {
      full_name: string;
      pickup_address: string | null;
      dropoff_address: string | null;
    };
    return {
      studentId: s.student_id,
      position: s.position,
      name: st.full_name,
      address: kind === "pickup" ? st.pickup_address : st.dropoff_address,
      state: stateByStudent.get(s.student_id) ?? "pending",
    };
  });

  return (
    <DriveScreen
      executionId={executionId}
      routeName={route.name}
      kind={kind}
      stops={driveStops}
    />
  );
}
