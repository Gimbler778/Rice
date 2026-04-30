import { api } from "@/lib/api-client";
import type { AdminCategory } from "@/page/admin/types";
import type { ApiSuccessResponse } from "@/types/integrations";

export type CategoriesResponse = {
  categories: AdminCategory[];
};

export type CreateCategoryInput = {
  name: string;
};

export type UpdateCategoryInput = {
  name?: string;
  isEnabled?: boolean;
};

export async function fetchCategories(): Promise<CategoriesResponse> {
  const response = await api.get<ApiSuccessResponse<CategoriesResponse>>("/api/categories");
  return response.data;
}

export async function createCategory(payload: CreateCategoryInput): Promise<{ category: AdminCategory }> {
  const response = await api.post<ApiSuccessResponse<{ category: AdminCategory }>, CreateCategoryInput>("/api/categories", payload);
  return response.data;
}

export async function updateCategory(id: string, payload: UpdateCategoryInput): Promise<{ category: AdminCategory }> {
  const response = await api.patch<ApiSuccessResponse<{ category: AdminCategory }>, UpdateCategoryInput>(`/api/categories/${id}`, payload);
  return response.data;
}

export async function deleteCategory(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccessResponse<{ id: string }>>(`/api/categories/${id}`);
  return response.data;
}
