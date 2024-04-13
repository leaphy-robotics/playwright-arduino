set -e
rm -rf build_assets build

BUILD_PATH=$(realpath build)
mkdir build_assets build && cd build_assets

git clone https://github.com/buserror/simavr
cd simavr

make -j8
cd examples/board_simduino

EXECUTABLE=$(find . | grep simduino.elf)
cp ATmegaBOOT_168_atmega328.ihex "${EXECUTABLE}" "${BUILD_PATH}"
