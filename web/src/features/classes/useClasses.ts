import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ClassDeletePreview, ClassItem } from "../../lib/types";

export const classesKeys = {
  all: ["classes"] as const,
};

export function useClasses() {
  return useQuery({
    queryKey: classesKeys.all,
    queryFn: () => api.get<ClassItem[]>("/classes"),
  });
}

export function useCreateClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; color: string }) =>
      api.post<ClassItem>("/classes", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: classesKeys.all }),
  });
}

export function useUpdateClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; color?: string }) =>
      api.patch<ClassItem>(`/classes/${id}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: classesKeys.all }),
  });
}

export function useDeleteClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, transferToClassId }: { id: string; transferToClassId?: string }) =>
      api.delete(`/classes/${id}${transferToClassId ? `?transfer_to_class_id=${transferToClassId}` : ""}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: classesKeys.all }),
  });
}

/** Fetch the delete preview only when the dialog is open. */
export function useDeletePreview(classId: string | null) {
  return useQuery({
    queryKey: ["classes", classId, "delete-preview"],
    queryFn: () => api.get<ClassDeletePreview>(`/classes/${classId}/delete-preview`),
    enabled: classId !== null,
  });
}
