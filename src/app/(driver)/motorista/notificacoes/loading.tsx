import { ListPageSkeleton } from "@/components/LoadingSkeletons";

export default function Loading() {
  return <ListPageSkeleton title="Notificações" subtitle="Novidades da operação" cards={2} action={false} />;
}
