import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
