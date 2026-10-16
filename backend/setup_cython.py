"""
backend/setup_cython.py
=======================
Script biên dịch các module an ninh và bản quyền thành Native C-Extension (.pyd):
- app/core/licensing/hwid.py
- app/core/licensing/verifier.py
- app/core/security/clock_monitor.py
- app/core/security/persistence.py

Cách sử dụng:
    python setup_cython.py build_ext --inplace
"""

import sys
from setuptools import setup, Extension

try:
    from Cython.Build import cythonize
    has_cython = True
except ImportError:
    has_cython = False

if not has_cython:
    print("[WARNING] Chưa cài đặt Cython. Để biên dịch .pyd, hãy chạy: pip install cython")

modules = [
    "app/core/licensing/hwid.py",
    "app/core/licensing/verifier.py",
    "app/core/security/clock_monitor.py",
    "app/core/security/persistence.py",
]

ext_modules = []
if has_cython:
    for m in modules:
        mod_name = m.replace("/", ".").replace(".py", "")
        ext_modules.append(
            Extension(
                mod_name,
                sources=[m],
                extra_compile_args=["/O2"] if sys.platform == "win32" else ["-O3"],
            )
        )

if __name__ == "__main__":
    if has_cython and ext_modules:
        setup(
            name="OmniVoiceCoreSecurity",
            ext_modules=cythonize(
                ext_modules,
                compiler_directives={"language_level": "3", "always_allow_keywords": True},
            ),
        )
    else:
        print("[INFO] Vui lòng cài đặt Cython và Visual Studio C++ Build Tools để biên dịch sang .pyd")
