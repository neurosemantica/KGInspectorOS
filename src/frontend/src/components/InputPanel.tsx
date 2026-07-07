import { useState } from "react";
import { GitCompare, Loader2 } from "lucide-react";

interface Props {
  onCompute: (oldGraph: string, newGraph: string) => void;
  loading: boolean;
}

const PLACEHOLDER = {
  old: `@prefix ex: <http://example.org/> .
ex:Alice ex:knows ex:Bob .
ex:Alice ex:age "30" .`,
  new: `@prefix ex: <http://example.org/> .
ex:Alice ex:knows ex:Carol .
ex:Alice ex:age "31" .`,
};

interface GraphInputProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}

function GraphInput({ label, value, placeholder, onChange }: GraphInputProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <textarea
        className="w-full h-48 rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/50 text-foreground placeholder:text-muted-foreground/40 transition-colors"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function InputPanel({ onCompute, loading }: Props) {
  const [oldGraph, setOldGraph] = useState("");
  const [newGraph, setNewGraph] = useState("");

  const canSubmit = oldGraph.trim() && newGraph.trim() && !loading;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GraphInput
          label="Old Graph (Turtle)"
          value={oldGraph}
          placeholder={PLACEHOLDER.old}
          onChange={setOldGraph}
        />
        <GraphInput
          label="New Graph (Turtle)"
          value={newGraph}
          placeholder={PLACEHOLDER.new}
          onChange={setNewGraph}
        />
      </div>

      <div className="flex justify-center pt-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-8 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer"
          disabled={!canSubmit}
          onClick={() => onCompute(oldGraph, newGraph)}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <GitCompare className="w-4 h-4" />
          )}
          {loading ? "Comparing…" : "Compare Graphs"}
        </button>
      </div>
    </div>
  );
}
