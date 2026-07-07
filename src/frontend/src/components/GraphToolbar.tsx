import type { MutableRefObject } from "react";
import type { Graph } from "@cosmos.gl/graph";
import { Maximize2, Pause, Play } from "lucide-react";

interface Props {
  graphRef: MutableRefObject<Graph | null>;
  simulating: boolean;
  setSimulating: (v: boolean) => void;
  simTimerRef?: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export function GraphToolbar({ graphRef, simulating, setSimulating, simTimerRef }: Props) {
  const toggleSim = () => {
    if (!graphRef.current) return;
    if (simulating) {
      graphRef.current.pause();
      if (simTimerRef?.current) clearTimeout(simTimerRef.current);
      setSimulating(false);
    } else {
      graphRef.current.unpause();
      setSimulating(true);
    }
  };

  return (
    <>
      <button
        onClick={toggleSim}
        className="glass rounded-md w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title={simulating ? "Pause simulation" : "Resume simulation"}
      >
        {simulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>
      <button
        onClick={() => graphRef.current?.fitView(400, 0.2)}
        className="glass rounded-md w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Fit graph to view"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
    </>
  );
}
