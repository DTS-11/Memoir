# ONNX Runtime
-keep class ai.onnxruntime.** { *; }
-keep class com.microsoft.onnxruntime.** { *; }
-dontwarn ai.onnxruntime.**

# react-native-worklets (rules not published as consumer rules)
-keep class com.swmansion.worklets.** { *; }

# react-native-reanimated (belt-and-suspenders)
-keep class com.swmansion.reanimated.** { *; }

# React Native new architecture bridges (required by worklets + reanimated)
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.fabric.** { *; }
