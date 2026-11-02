import { ListPageSkeleton } from "@/components/LoadingSkeletons";

export default function Loading() {
  return <ListPageSkeleton title="Alunos" subtitle="Quem você atende" cards={4} />;
}
