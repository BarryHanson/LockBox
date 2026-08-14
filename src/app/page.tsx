import { AnimatedHeader } from "@/components/animated-header";
import { AnimatedMain } from "@/components/animated-main";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <AnimatedHeader />
      <AnimatedMain />
    </div>
  );
}