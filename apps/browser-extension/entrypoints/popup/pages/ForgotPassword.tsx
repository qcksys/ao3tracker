import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { apiBaseUrlItem, resolveApiBaseUrl } from "@/lib/storage";
import { authClient } from "~popup/lib/auth-client";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
});
type ForgotValues = z.infer<typeof schema>;

export default function ForgotPassword() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<ForgotValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotValues): Promise<void> => {
    // The server hosts the static reset page at `${baseUrl}/reset-password`,
    // which reads `?token=...` from the URL and POSTs to /auth/reset-password.
    const baseUrl = resolveApiBaseUrl(await apiBaseUrlItem.getValue());
    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: `${baseUrl.replace(/\/$/, "")}/reset-password`,
    });
    if (error) {
      form.setError("email", {
        message: error.message ?? "Could not request a password reset",
      });
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex h-full flex-col gap-4">
        <header>
          <h1 className="text-lg font-semibold">Check your inbox</h1>
          <p className="text-muted-foreground text-sm">
            If an account exists for that email, we've sent a reset link.
          </p>
        </header>
        <p className="text-muted-foreground text-xs">
          The link will open a page where you can pick a new password. It expires in 1 hour.
        </p>
        <Link to="/login" className="text-primary text-sm hover:underline">
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">Forgot your password?</h1>
        <p className="text-muted-foreground text-sm">
          Enter your email and we'll send a reset link.
        </p>
      </header>
      <Form {...form}>
        <form className="flex flex-col gap-3" onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </Form>
      <Link to="/login" className="text-muted-foreground text-sm hover:underline">
        ← Back to sign in
      </Link>
    </div>
  );
}
