"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ClearTokens() {
  const router = useRouter();

  useEffect(() => {
    // Clear localStorage
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      // Also clear the auth cookie
      document.cookie =
        "auth-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

      console.log("All tokens cleared");

      // Redirect to homepage after clearing
      setTimeout(() => {
        router.push("/");
      }, 1000);
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-4">
          Clearing Authentication Data
        </h1>
        <p className="mb-4">Removing any stored tokens and cookies...</p>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto"></div>
        <p className="mt-4 text-sm text-gray-500 text-center">
          You will be redirected to the homepage shortly.
        </p>
      </div>
    </div>
  );
}
