import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
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
import { authClient } from "~popup/lib/auth-client";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type LoginValues = z.infer<typeof schema>;

export default function Login() {
  const navigate = useNavigate();
  const form = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginValues): Promise<void> => {
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    if (error) {
      form.setError("password", { message: error.message ?? "Sign in failed" });
      return;
    }
    navigate("/");
  };

  const onPasskey = async (): Promise<void> => {
    const { error } = await authClient.signIn.passkey();
    if (error) {
      form.setError("password", { message: error.message ?? "Passkey sign in failed" });
      return;
    }
    navigate("/");
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="text-muted-foreground text-sm">
          Sync your AO3 progress across devices.
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
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Form>
      <Button type="button" variant="outline" onClick={onPasskey}>
        Use passkey
      </Button>
      <div className="flex items-center justify-between text-sm">
        <Link
          to="/forgot-password"
          className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
        <Link to="/register" className="text-primary underline-offset-4 hover:underline">
          Create account
        </Link>
      </div>
    </div>
  );
}
