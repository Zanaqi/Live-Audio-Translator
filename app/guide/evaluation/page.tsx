"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FeedbackEvaluationDashboard from "@/app/components/FeedbackEvaluationDashboard";
import { useAuth } from "@/lib/context/AuthContext";

export default function EvaluationPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Check authentication
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (user?.role !== "guide") {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            Translation Evaluation
          </h1>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Back to Dashboard
          </button>
        </div>

        <FeedbackEvaluationDashboard />
      </div>
    </div>
  );
}
