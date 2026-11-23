import { MealPlannerApp } from '@/components/MealPlannerApp';
import { getAllBoards, getAllRecipes } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [boards, recipes] = await Promise.all([getAllBoards(), getAllRecipes()]);
  return <MealPlannerApp initialBoards={boards} initialRecipes={recipes} />;
}
