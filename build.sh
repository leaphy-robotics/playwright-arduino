set -e
rm -rf build

BUILD_PATH=$(realpath build)

cd simduino
gcc -I /usr/include/simavr -I /usr/include/simavr/parts simduino.c -lsimavr -lsimavrparts -o simduino

mkdir "${BUILD_PATH}"
cp simduino ATmegaBOOT_168_atmega328.ihex "${BUILD_PATH}"
