# Face models

Face scanning no longer ships ONNX model files.

Detection uses Google ML Kit through `@react-native-ml-kit/face-detection`
(native, bundled with the app). Person grouping uses a lightweight
appearance + landmark "fingerprint" computed on the JS thread from the
detected face crops — no models, no downloads, no external data files.
