// Our outer if statement
outerIf: if (true) {
    // Our inner if statement
    innerIf: if (true) {
        break outerIf; // Immediately skips to the end of the outer if statement
    }
    console.log("This never logs!");
}
let x = 0;
loop1: while (x < 5) {
    x++;
    for (let y = 0; y < x; y++) {
        // This will jump back to the top of outerLoop
        if (y === 2) continue loop1;
        console.log(x, y);
    }
    console.log("----"); // This will only happen if x < 6
}