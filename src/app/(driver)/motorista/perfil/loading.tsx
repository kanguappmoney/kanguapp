import { ListPageSkeleton } from "@/components/LoadingSkeletons";

export default function Loading() {
  return <ListPageSkeleton title="Configurações" subtitle="Conta profissional" cards={4} action={false} />;
}
