import React from 'react'
import {
  Home, Bolt, ShoppingCart, Car, Heart, Dumbbell, Gamepad2, Package, GraduationCap, Shirt, Plane, Gift,
  MoreHorizontal, Briefcase, Code2, TrendingUp, PiggyBank, ArrowLeftRight, Sun, Moon, Plus, ChevronRight,
  ChevronLeft, ArrowUpRight, ArrowDownRight, Target, Wallet, LayoutGrid, List, BarChart3, Settings, Bot,
  Building2, Shield, X, AlertTriangle, Calendar, Monitor, Scale
} from 'lucide-react'

const iconMap = {
  Home, Bolt, ShoppingCart, Car, Heart, Dumbbell, Gamepad2, Package, GraduationCap, Shirt, Plane, Gift,
  MoreHorizontal, Briefcase, Code2, TrendingUp, PiggyBank, ArrowLeftRight, Sun, Moon, Plus, ChevronRight,
  ChevronLeft, ArrowUpRight, ArrowDownRight, Target, Wallet, LayoutGrid, List, BarChart3, Settings, Bot,
  Building2, Shield, X, AlertTriangle, Calendar, Monitor, Scale,
}

export function Icon({ name, size = 18, className = '' }) {
  const Cmp = iconMap[name] || MoreHorizontal
  return <Cmp size={size} className={className} />
}
