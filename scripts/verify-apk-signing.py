#!/usr/bin/env python3
"""Verify which Android APK signing schemes (V1/V2/V3) a release APK uses,
without needing apksigner or the Android SDK.

Usage: python scripts/verify-apk-signing.py path/to/app.apk
"""
import sys, struct, hashlib, zipfile


def main(path: str) -> None:
    with open(path, 'rb') as f:
        data = f.read()

    print(f"APK file size : {len(data)/1024/1024:.1f} MB")

    magic = b'APK Sig Block 42'
    v2_marker = data.find(magic)
    print(f"APK Signing Block magic : {'PRESENT' if v2_marker >= 0 else 'MISSING'}")

    scheme_ids = {
        0x7109871a: 'V2',
        0xf05368c0: 'V3',
        0x1b93ad61: 'V3.1',
        0x42726577: 'V4',
    }
    found = set()

    if v2_marker >= 0:
        # The APK Signing Block magic sits at the end of the block:
        # [size_of_block (u64)] [pairs ...] [size_of_block (u64)] [magic (16B)]
        size_of_block = struct.unpack('<Q', data[v2_marker-8:v2_marker])[0]
        # size_of_block covers: pairs_data + 8 (trailing size) + 16 (magic).
        # Therefore pairs_start = magic_offset + 16 - size_of_block.
        pairs_start = v2_marker + 16 - size_of_block
        pairs_end = v2_marker - 8  # ends before the trailing size_of_block field

        i = pairs_start
        while i < pairs_end - 12:
            pair_len = struct.unpack('<Q', data[i:i+8])[0]
            if pair_len < 4 or i + 8 + pair_len > pairs_end:
                break
            bid = struct.unpack('<I', data[i+8:i+12])[0]
            if bid in scheme_ids:
                found.add(scheme_ids[bid])
            i += 8 + pair_len

    # V1 = JAR signing files in META-INF/
    with zipfile.ZipFile(path, 'r') as z:
        v1_files = [
            n for n in z.namelist()
            if n.startswith('META-INF/')
            and (n.endswith('.RSA') or n.endswith('.DSA') or n.endswith('.EC') or n.endswith('.SF'))
        ]

    print()
    print(f"V1 (JAR signing): {'yes' if v1_files else 'no  (typical and fine for minSdkVersion >= 24)'}")
    print(f"V2              : {'yes' if 'V2' in found else 'no'}")
    print(f"V3              : {'yes' if 'V3' in found else 'no'}")
    print(f"V3.1            : {'yes' if 'V3.1' in found else 'no'}")
    print(f"V4              : {'yes' if 'V4' in found else 'no'}")

    if v1_files:
        print()
        print("V1 signature files:")
        for n in v1_files:
            print(f"  {n}")

    if 'V2' not in found and 'V3' not in found:
        print()
        print("WARNING: neither V2 nor V3 signature scheme detected — sideload installs may be rejected on Android 7+", file=sys.stderr)
        sys.exit(1)

    # Extract signer certificate from V2 block to print fingerprint.
    if v2_marker >= 0:
        size_of_block = struct.unpack('<Q', data[v2_marker-8:v2_marker])[0]
        pairs_start = v2_marker + 16 - size_of_block
        pairs_end = v2_marker - 8
        i = pairs_start
        while i < pairs_end - 12:
            pair_len = struct.unpack('<Q', data[i:i+8])[0]
            if pair_len < 4 or i + 8 + pair_len > pairs_end:
                break
            bid = struct.unpack('<I', data[i+8:i+12])[0]
            if bid == 0x7109871a:  # V2 block contains signer chain
                payload = data[i+12 : i+8+pair_len]
                # Heuristic: find first ASN.1 DER cert (SEQUENCE, long-form length).
                for j in range(len(payload) - 4):
                    if payload[j] == 0x30 and payload[j+1] == 0x82:
                        cert_len = struct.unpack('>H', payload[j+2:j+4])[0] + 4
                        if j + cert_len > len(payload):
                            continue
                        cert = payload[j:j+cert_len]
                        fp = hashlib.sha256(cert).hexdigest()
                        fp_fmt = ':'.join(fp[k:k+2] for k in range(0, len(fp), 2)).upper()
                        print()
                        print(f"Signer certificate SHA-256:")
                        print(f"  {fp_fmt}")
                        return
            i += 8 + pair_len


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} path/to/app.apk", file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1])
