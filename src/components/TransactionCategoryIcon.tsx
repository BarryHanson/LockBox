import {
  Plane,
  Car,
  ShoppingBag,
  Home,
  Utensils,
  CreditCard,
  Dumbbell,
  Smartphone,
  Briefcase,
  Heart,
  GraduationCap,
  Bus,
  DollarSign,
  Gift,
  Coffee,
  Shirt,
  LucideIcon,
  CircleDot
} from "lucide-react";

interface CategoryIcon {
  icon: LucideIcon;
  color: string;
}

const categoryIcons: Record<string, CategoryIcon> = {
  TRAVEL: { icon: Plane, color: '#06b6d4' }, // cyan
  TRANSPORTATION: { icon: Car, color: '#3b82f6' }, // blue
  SHOPPING: { icon: ShoppingBag, color: '#8b5cf6' }, // violet
  RENT_AND_UTILITIES: { icon: Home, color: '#f59e0b' }, // amber
  FOOD_AND_DRINK: { icon: Utensils, color: '#ef4444' }, // red
  PAYMENT: { icon: CreditCard, color: '#64748b' }, // slate
  RECREATION: { icon: Dumbbell, color: '#22c55e' }, // green
  TECHNOLOGY: { icon: Smartphone, color: '#6366f1' }, // indigo
  INCOME: { icon: DollarSign, color: '#16a34a' }, // green
  TRANSFER: { icon: CreditCard, color: '#64748b' }, // slate
  LOAN_PAYMENTS: { icon: CreditCard, color: '#dc2626' }, // red
  GENERAL_MERCHANDISE: { icon: ShoppingBag, color: '#8b5cf6' }, // violet
  HEALTHCARE: { icon: Heart, color: '#ec4899' }, // pink
  EDUCATION: { icon: GraduationCap, color: '#0ea5e9' }, // sky
  ENTERTAINMENT: { icon: Coffee, color: '#f43f5e' }, // rose
  PERSONAL_CARE: { icon: Heart, color: '#ec4899' }, // pink
  TRANSPORTATION_SERVICES: { icon: Bus, color: '#3b82f6' }, // blue
  GENERAL_SERVICES: { icon: Briefcase, color: '#64748b' }, // slate
  GIFTS_AND_DONATIONS: { icon: Gift, color: '#d946ef' }, // fuchsia
  CLOTHING: { icon: Shirt, color: '#0d9488' } // teal
};

interface TransactionCategoryIconProps {
  category: string;
  className?: string;
}

export function TransactionCategoryIcon({ category, className = "" }: TransactionCategoryIconProps) {
  const categoryIcon = categoryIcons[category] || { icon: CircleDot, color: '#94a3b8' };
  const Icon = categoryIcon.icon;
  return (
    <div className="relative group">
      <Icon 
        className={`w-4 h-4 ${className}`} 
        style={{ color: categoryIcon.color }} 
      />
      <div className="absolute hidden group-hover:block bg-secondary text-secondary-foreground text-xs rounded px-2 py-1 -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
        {category.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ')}
      </div>
    </div>
  );
}
