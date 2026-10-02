# PostHog uses Gson reflection to persist and restore crash reports.
-keepattributes Signature,*Annotation*
-keep class com.posthog.** { *; }
-keep class com.google.gson.** { *; }

# Prevent invalid Okio bridge return types after ProGuard optimization.
-keep class okio.** { *; }
-dontwarn android.**
-dontwarn dalvik.**
-dontwarn javax.annotation.**
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn org.codehaus.mojo.animal_sniffer.**
-dontwarn com.jetbrains.SharedTextures
-adaptresourcefilenames okhttp3/internal/publicsuffix/PublicSuffixDatabase.gz
