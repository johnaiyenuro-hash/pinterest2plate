import { MealPlannerApp } from '@/components/MealPlannerApp';
import { getAllBoards, getAllRecipes, getStorageMode, getUserState } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [boards, recipes, userState] = await Promise.all([
    getAllBoards(),
    getAllRecipes(),
    getUserState(),
  ]);
  const storageMode = getStorageMode();
  return (
    <MealPlannerApp
      initialBoards={boards}
      initialRecipes={recipes}
      initialUserState={userState}
      initialStorageMode={storageMode}
    />
  );
}
