import NextAuth, { NextAuthOptions } from "next-auth";
import LinkedInProvider from "next-auth/providers/linkedin";
import { createClient } from "@supabase/supabase-js";

const authOptions: NextAuthOptions = {
  providers: [
    LinkedInProvider({
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
      client: { token_endpoint_auth_method: 'client_secret_post' },
      authorization: {
        params: { scope: 'openid profile email w_member_social' },
      },
      issuer: 'https://www.linkedin.com/oauth',
      jwks_endpoint: 'https://www.linkedin.com/oauth/openid/jwks',
      profile(profile, tokens) {
        const defaultImage = 'https://cdn-icons-png.flaticon.com/512/174/174857.png';
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture || defaultImage,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "linkedin") {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          const { error } = await supabase
            .from("users")
            .upsert({
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
              linkedin_access_token: account.access_token,
            }, { onConflict: 'id' });
            
          if (error) {
            console.error("Error saving user to Supabase:", error);
          }
        } else {
          console.error("Missing Supabase environment variables.");
        }
      }
      return true;
    },
    async jwt({ token, account }) {
      // Persist the LinkedIn access_token in the JWT on sign-in
      if (account?.provider === "linkedin" && account.access_token) {
        token.linkedinAccessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).linkedinAccessToken = token.linkedinAccessToken;
      }
      return session;
    }
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
