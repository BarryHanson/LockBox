import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SortOption = 
  | "date-desc" 
  | "date-asc" 
  | "amount-desc" 
  | "amount-asc" 
  | "category";

interface TransactionFiltersProps {
  onSortChange: (value: SortOption) => void;
  currentSort: SortOption;
}

export function TransactionFilters({ onSortChange, currentSort }: TransactionFiltersProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center space-x-2">
        <span className="text-sm text-muted-foreground">Sort by:</span>
        <Select value={currentSort} onValueChange={onSortChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Newest first</SelectItem>
            <SelectItem value="date-asc">Oldest first</SelectItem>
            <SelectItem value="amount-desc">Highest amount</SelectItem>
            <SelectItem value="amount-asc">Lowest amount</SelectItem>
            <SelectItem value="category">Category</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
