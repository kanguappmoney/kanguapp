import { ListPageSkeleton } from "@/components/LoadingSkeletons";

export default function Loading() {
  return <ListPageSkeleton title="Rotas" subtitle="Suas rotas e o dia de hoje" cards={2} />;
}
