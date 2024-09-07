# pytest-pyodide script
# invoke me with:
# pytest --runtime=chrome --runner=playwright --dist-dir=$PYODIDE_DIST ./pyodide-test.py
# may need to also `pythom -m playwright install chrome`

# Wasn't able to generate a lockfile.
# pyodide lockfile add-wheels --input pyodide-lock.json --output pyodide-lock-psp.json --wheel-url https://files.localhost/psp-wheels/ ~/www/files/psp-wheels/perspective_python-3.0.3-cp39-abi3-emscripten_3_1_58_wasm32.whl
# This complains:
# > RuntimeError: Package tags for /Users/tom/perspective/perspective/rust/target/wheels/perspective_python-3.0.3-cp39-abi3-emscripten_3_1_58_wasm32.whl
# > don't match Python version in lockfile:Lockfile python 3.12on platform emscripten_3_1_58_wasm32 (cp312)
# see: https://github.com/pyodide/pyodide-lock/pull/32

from pytest_pyodide import run_in_pyodide
import pytest


# @pytest.fixture(autouse=True)
# async def setup_function(selenium):
#     print("Installed wheel")


@run_in_pyodide(packages=["micropip"])
async def test_bad_csv(selenium):
    import micropip

    await micropip.install(
        "https://files.localhost/psp-wheels/perspective_python-3.0.3-cp39-abi3-emscripten_3_1_58_wasm32.whl"
    )
    import pytest

    import perspective

    server = perspective.Server()
    client = server.new_local_client()
    with pytest.raises(perspective.PerspectiveError):
        client.table("a,b,c\n1,2")
