from setuptools import setup, find_packages

setup(
    name="valkey-maze",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "svgwrite",
    ],
)
